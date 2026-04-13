export {};

declare module "https://esm.sh/@supabase/supabase-js@2" {
  export function createClient(
    url: string,
    key: string,
    options?: Record<string, unknown>
  ): {
    from(table: string): {
      insert(values: Record<string, unknown> | Record<string, unknown>[]): Promise<{ data: unknown; error: unknown }>;
      update(values: Record<string, unknown>): {
        eq(column: string, value: unknown): Promise<{ data: unknown; error: unknown }>;
      };
      eq(column: string, value: unknown): Promise<{ data: unknown; error: unknown }>;
    };
  };
}

declare global {
  interface DenoEnv {
    get(key: string): string | undefined;
  }

  interface DenoNamespace {
    env: DenoEnv;
    serve(handler: (req: Request) => Response | Promise<Response>): void;
  }

  // deno-lint-ignore no-var
  var Deno: DenoNamespace;
}
