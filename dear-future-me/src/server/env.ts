/** Server-side configuration. Read lazily so builds work without secrets. */
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}
const opt = (name: string) => process.env[name] || undefined;

export const env = {
  get appUrl() {
    return (opt("APP_URL") ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
  get redisUrl() {
    return opt("REDIS_URL") ?? "redis://localhost:6379";
  },
  get storageDriver(): "local" | "s3" {
    return opt("STORAGE_DRIVER") === "s3" ? "s3" : "local";
  },
  get storageLocalDir() {
    return opt("STORAGE_LOCAL_DIR") ?? ".data/storage";
  },
  get storageSigningSecret() {
    return req("STORAGE_SIGNING_SECRET");
  },
  s3: {
    get endpoint() {
      return opt("S3_ENDPOINT");
    },
    get region() {
      return opt("S3_REGION") ?? "auto";
    },
    get bucket() {
      return req("S3_BUCKET");
    },
    get accessKeyId() {
      return req("S3_ACCESS_KEY_ID");
    },
    get secretAccessKey() {
      return req("S3_SECRET_ACCESS_KEY");
    },
  },
  get resendKey() {
    return opt("RESEND_API_KEY");
  },
  get emailFrom() {
    return opt("EMAIL_FROM") ?? "Dear Future Me <hello@example.com>";
  },
  get stripeKey() {
    return opt("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret() {
    return opt("STRIPE_WEBHOOK_SECRET");
  },
  get anthropicKey() {
    return opt("ANTHROPIC_API_KEY");
  },
  get googleEnabled() {
    return Boolean(opt("AUTH_GOOGLE_ID") && opt("AUTH_GOOGLE_SECRET"));
  },
};
