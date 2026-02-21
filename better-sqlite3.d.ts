declare module "better-sqlite3" {
  type Params = unknown[] | Record<string, unknown>;

  interface Statement {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  interface TransactionFunction<T> {
    (): T;
  }

  class Database {
    constructor(filename: string);
    exec(sql: string): this;
    prepare(sql: string): Statement;
    transaction<T>(fn: () => T): TransactionFunction<T>;
  }

  export default Database;
}
