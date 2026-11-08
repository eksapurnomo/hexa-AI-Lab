declare type BufferEncoding = "utf8" | "hex" | "base64" | "base64url";

declare class Buffer {
  static from(data: string | number[], encoding?: BufferEncoding): Buffer;
  toString(encoding?: BufferEncoding): string;
  length: number;
  [index: number]: number;
}

declare namespace NodeJS {
  interface ProcessEnv {
    [key: string]: string | undefined;
  }
}

declare var process: {
  env: NodeJS.ProcessEnv;
  cwd(): string;
  exit(code?: number): never;
};

declare var __dirname: string;

declare var require: {
  main: unknown;
};

declare var module: unknown;

interface Headers {
  getSetCookie?(): string[];
}

declare module "crypto" {
  export interface CipherGCM {
    update(data: string, inputEncoding: BufferEncoding, outputEncoding: BufferEncoding): string;
    final(outputEncoding: BufferEncoding): string;
    getAuthTag(): Buffer;
  }
  export interface DecipherGCM {
    setAuthTag(buffer: Buffer): void;
    update(data: string, inputEncoding: BufferEncoding, outputEncoding: BufferEncoding): string;
    final(outputEncoding: BufferEncoding): string;
  }
  export function randomBytes(size: number): Buffer;
  export function scryptSync(
    password: string | Buffer,
    salt: Buffer,
    keylen: number,
    options?: { N?: number; r?: number; p?: number; maxmem?: number }
  ): Buffer;
  export function createCipheriv(algorithm: "aes-256-gcm", key: Buffer, iv: Buffer): CipherGCM;
  export function createDecipheriv(algorithm: "aes-256-gcm", key: Buffer, iv: Buffer): DecipherGCM;
  export function timingSafeEqual(a: Buffer, b: Buffer): boolean;
  const cryptoDefault: {
    randomBytes: typeof randomBytes;
    scryptSync: typeof scryptSync;
    createCipheriv: typeof createCipheriv;
    createDecipheriv: typeof createDecipheriv;
    timingSafeEqual: typeof timingSafeEqual;
  };
  export default cryptoDefault;
}

declare module "fs" {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string): Buffer;
  export function readFileSync(path: string, encoding: BufferEncoding): string;
  export function writeFileSync(
    path: string,
    data: string | Buffer,
    options?: { encoding?: BufferEncoding; mode?: number }
  ): void;
  export function statSync(path: string): { isFile(): boolean; mode: number };
  export function unlinkSync(path: string): void;
  const fsDefault: {
    existsSync: typeof existsSync;
    readFileSync: typeof readFileSync;
    writeFileSync: typeof writeFileSync;
    statSync: typeof statSync;
    unlinkSync: typeof unlinkSync;
  };
  export default fsDefault;
}

declare module "path" {
  export const sep: string;
  export function resolve(...paths: string[]): string;
  export function join(...paths: string[]): string;
  export function basename(p: string): string;
  export function extname(p: string): string;
  const pathDefault: {
    sep: string;
    resolve: typeof resolve;
    join: typeof join;
    basename: typeof basename;
    extname: typeof extname;
  };
  export default pathDefault;
}

declare module "url" {
  export class URL {
    constructor(input: string, base?: string);
    protocol: string;
    hostname: string;
    pathname: string;
  }
}

declare module "http" {
  export interface IncomingMessage {
    method?: string;
    url?: string;
    headers: {
      origin?: string;
      cookie?: string;
      [key: string]: string | string[] | undefined;
    };
    socket: {
      remoteAddress?: string;
    };
    on(event: "data", listener: (chunk: Buffer) => void): this;
    on(event: "end", listener: () => void): this;
    on(event: "error", listener: (err: Error) => void): this;
    destroy(): void;
  }
  export interface ServerResponse {
    setHeader(name: string, value: string | string[]): void;
    writeHead(statusCode: number, headers?: Record<string, string>): void;
    end(data?: string | Buffer): void;
  }
  export interface AddressInfo {
    port: number;
    family: string;
    address: string;
  }
  export interface Server {
    listen(port: number, hostname: string, listeningListener?: () => void): this;
    address(): AddressInfo | string | null;
    close(callback?: (err?: Error) => void): this;
  }
  export function createServer(
    requestListener: (req: IncomingMessage, res: ServerResponse) => void
  ): Server;
  const httpDefault: {
    createServer: typeof createServer;
  };
  export default httpDefault;
}

declare module "assert" {
  export function ok(value: unknown, message?: string): void;
  export function strictEqual<T>(actual: T, expected: T, message?: string): void;
  export function notStrictEqual<T>(actual: T, expected: T, message?: string): void;
  export function throws(block: () => unknown, error?: unknown, message?: string): void;
  export function rejects(
    block: () => Promise<unknown>,
    error?: unknown,
    message?: string
  ): Promise<void>;
  const assertDefault: {
    ok: typeof ok;
    strictEqual: typeof strictEqual;
    notStrictEqual: typeof notStrictEqual;
    throws: typeof throws;
    rejects: typeof rejects;
  };
  export default assertDefault;
}
