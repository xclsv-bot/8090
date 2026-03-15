export type SecretProviderType = 'render' | 'aws' | 'local';

export enum SecretKey {
  DATABASE_URL = 'DATABASE_URL',
  CLERK_SECRET_KEY = 'CLERK_SECRET_KEY',
  AWS_ACCESS_KEY_ID = 'AWS_ACCESS_KEY_ID',
  AWS_SECRET_ACCESS_KEY = 'AWS_SECRET_ACCESS_KEY',
  ENCRYPTION_SECRET = 'ENCRYPTION_SECRET',
  ENCRYPTION_KEY = 'ENCRYPTION_KEY',
  QUICKBOOKS_CLIENT_ID = 'QUICKBOOKS_CLIENT_ID',
  QUICKBOOKS_CLIENT_SECRET = 'QUICKBOOKS_CLIENT_SECRET',
  RAMP_CLIENT_ID = 'RAMP_CLIENT_ID',
  RAMP_CLIENT_SECRET = 'RAMP_CLIENT_SECRET',
  CUSTOMERIO_API_KEY = 'CUSTOMERIO_API_KEY',
  AI_VISION_API_KEY = 'AI_VISION_API_KEY',
}

export interface SecretMetadata {
  key: SecretKey;
  description: string;
  required: boolean;
  rotationIntervalDays: number | null;
}

export const SECRET_METADATA: Record<SecretKey, SecretMetadata> = {
  [SecretKey.DATABASE_URL]: {
    key: SecretKey.DATABASE_URL,
    description: 'Primary Neon PostgreSQL connection string',
    required: true,
    rotationIntervalDays: 180,
  },
  [SecretKey.CLERK_SECRET_KEY]: {
    key: SecretKey.CLERK_SECRET_KEY,
    description: 'Clerk backend auth secret',
    required: false,
    rotationIntervalDays: 180,
  },
  [SecretKey.AWS_ACCESS_KEY_ID]: {
    key: SecretKey.AWS_ACCESS_KEY_ID,
    description: 'AWS IAM access key id for S3/runtime services',
    required: false,
    rotationIntervalDays: 90,
  },
  [SecretKey.AWS_SECRET_ACCESS_KEY]: {
    key: SecretKey.AWS_SECRET_ACCESS_KEY,
    description: 'AWS IAM secret access key',
    required: false,
    rotationIntervalDays: 90,
  },
  [SecretKey.ENCRYPTION_SECRET]: {
    key: SecretKey.ENCRYPTION_SECRET,
    description: 'OAuth token encryption secret',
    required: false,
    rotationIntervalDays: 180,
  },
  [SecretKey.ENCRYPTION_KEY]: {
    key: SecretKey.ENCRYPTION_KEY,
    description: 'Legacy integration encryption key',
    required: false,
    rotationIntervalDays: 180,
  },
  [SecretKey.QUICKBOOKS_CLIENT_ID]: {
    key: SecretKey.QUICKBOOKS_CLIENT_ID,
    description: 'QuickBooks OAuth client id',
    required: false,
    rotationIntervalDays: 90,
  },
  [SecretKey.QUICKBOOKS_CLIENT_SECRET]: {
    key: SecretKey.QUICKBOOKS_CLIENT_SECRET,
    description: 'QuickBooks OAuth client secret',
    required: false,
    rotationIntervalDays: 90,
  },
  [SecretKey.RAMP_CLIENT_ID]: {
    key: SecretKey.RAMP_CLIENT_ID,
    description: 'Ramp OAuth client id',
    required: false,
    rotationIntervalDays: 90,
  },
  [SecretKey.RAMP_CLIENT_SECRET]: {
    key: SecretKey.RAMP_CLIENT_SECRET,
    description: 'Ramp OAuth client secret',
    required: false,
    rotationIntervalDays: 90,
  },
  [SecretKey.CUSTOMERIO_API_KEY]: {
    key: SecretKey.CUSTOMERIO_API_KEY,
    description: 'Customer.io private API key',
    required: false,
    rotationIntervalDays: 90,
  },
  [SecretKey.AI_VISION_API_KEY]: {
    key: SecretKey.AI_VISION_API_KEY,
    description: 'AI Vision service API key',
    required: false,
    rotationIntervalDays: 90,
  },
};

export interface ValidateSecretsOptions {
  provider?: SecretProviderType;
  nodeEnv?: string;
  source?: Record<string, string | undefined>;
  throwOnError?: boolean;
}

export interface ValidateSecretsResult {
  valid: boolean;
  provider: SecretProviderType;
  missing: SecretKey[];
}

export function getRequiredSecretKeys(nodeEnv = process.env.NODE_ENV || 'development'): SecretKey[] {
  const required = new Set<SecretKey>([SecretKey.DATABASE_URL]);

  if (nodeEnv === 'production') {
    required.add(SecretKey.CLERK_SECRET_KEY);
    if (!process.env.ENCRYPTION_SECRET && !process.env.ENCRYPTION_KEY) {
      required.add(SecretKey.ENCRYPTION_SECRET);
    }
  }

  return [...required];
}

export function validateSecrets(options: ValidateSecretsOptions = {}): ValidateSecretsResult {
  const provider = options.provider ?? ((process.env.SECRET_PROVIDER as SecretProviderType) || 'render');
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? 'development';
  const source = options.source ?? process.env;

  const requiredSecrets = getRequiredSecretKeys(nodeEnv);
  const missing = requiredSecrets.filter((key) => {
    const value = source[key];
    return !value || !value.trim();
  });

  if (options.throwOnError !== false && missing.length > 0) {
    const hint =
      provider === 'render'
        ? 'Configure secrets in Render Environment Variables.'
        : provider === 'aws'
          ? 'Configure secrets in AWS Secrets Manager and runtime IAM permissions.'
          : 'Configure secrets in .env.local for local development.';

    throw new Error(
      `Missing required secrets: ${missing.join(', ')}. SECRET_PROVIDER=${provider}. ${hint}`
    );
  }

  return {
    valid: missing.length === 0,
    provider,
    missing,
  };
}
