import type { Snapshot } from "./types.ts";

export const REGION_NAMES: Record<string, string> = {
  "us-east-1": "N. Virginia",
  "us-east-2": "Ohio",
  "us-west-1": "N. California",
  "us-west-2": "Oregon",
  "ca-central-1": "Canada",
  "ca-west-1": "Calgary",
  "mx-central-1": "Mexico",
  "sa-east-1": "São Paulo",
  "eu-west-1": "Ireland",
  "eu-west-2": "London",
  "eu-west-3": "Paris",
  "eu-central-1": "Frankfurt",
  "eu-central-2": "Zurich",
  "eu-north-1": "Stockholm",
  "eu-south-1": "Milan",
  "eu-south-2": "Spain",
  "me-south-1": "Bahrain",
  "me-central-1": "UAE",
  "il-central-1": "Tel Aviv",
  "af-south-1": "Cape Town",
  "ap-south-1": "Mumbai",
  "ap-south-2": "Hyderabad",
  "ap-southeast-1": "Singapore",
  "ap-southeast-2": "Sydney",
  "ap-southeast-3": "Jakarta",
  "ap-southeast-4": "Melbourne",
  "ap-southeast-5": "Malaysia",
  "ap-southeast-7": "Thailand",
  "ap-northeast-1": "Tokyo",
  "ap-northeast-2": "Seoul",
  "ap-northeast-3": "Osaka",
  "ap-east-1": "Hong Kong",
  "ap-east-2": "Taipei",
};

/** Isı haritasında varsayılan görünen bölgeler. Bölgesi dışarıda kalan bir olay olursa sütun otomatik eklenir. */
export const CORE_REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "ca-central-1",
  "sa-east-1",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-central-1",
  "eu-north-1",
  "eu-south-1",
  "af-south-1",
  "ap-south-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "ap-northeast-2",
  "global",
];

export const SERVICE_PATTERNS: [key: string, name: string, re: RegExp][] = [
  ["ec2", "EC2", /\bEC2\b|Elastic Compute Cloud/i],
  ["eks", "EKS", /\bEKS\b|Elastic Kubernetes/i],
  ["ecs", "ECS", /\bECS\b|Elastic Container Service/i],
  ["ecr", "ECR", /\bECR\b|Elastic Container Registry/i],
  ["rds", "RDS / Aurora", /\bRDS\b|\bAurora\b|Relational Database Service/i],
  ["s3", "S3", /\bS3\b|Simple Storage Service/i],
  ["lambda", "Lambda", /\bLambda\b/i],
  ["dynamodb", "DynamoDB", /DynamoDB/i],
  ["cloudfront", "CloudFront", /CloudFront/i],
  ["route53", "Route 53", /Route ?53/i],
  ["elb", "Load Balancing", /Elastic Load Balanc|\bALB\b|\bNLB\b/i],
  ["vpc", "VPC", /\bVPC\b|NAT Gateway/i],
  ["iam", "IAM", /\bIAM\b|Identity and Access/i],
  ["sqs", "SQS", /\bSQS\b/i],
  ["sns", "SNS", /\bSNS\b/i],
  ["cloudwatch", "CloudWatch", /CloudWatch/i],
  ["apigateway", "API Gateway", /API Gateway/i],
  ["kafka", "MSK (Kafka)", /\bMSK\b|Managed Streaming/i],
  ["opensearch", "OpenSearch", /OpenSearch|Elasticsearch/i],
  ["elasticache", "ElastiCache", /ElastiCache/i],
  ["secretsmanager", "Secrets Manager", /Secrets Manager/i],
  ["kms", "KMS", /\bKMS\b|Key Management/i],
  ["cognito", "Cognito", /Cognito/i],
  ["cloudformation", "CloudFormation", /CloudFormation/i],
  ["codebuild", "CodeBuild", /CodeBuild/i],
  ["waf", "WAF", /\bWAF\b/i],
  ["sts", "STS", /\bSTS\b/i],
];

export const SERVICE_NAMES: Record<string, string> = Object.fromEntries(SERVICE_PATTERNS.map(([k, n]) => [k, n]));

export const CORE_SERVICES = SERVICE_PATTERNS.map(([k]) => k);

const ALIASES: Record<string, string> = {
  msk: "kafka",
  awskafka: "kafka",
  elasticloadbalancing: "elb",
  es: "opensearch",
  aurora: "rds",
  rdsaurora: "rds",
  apigw: "apigateway",
  "api-gateway": "apigateway",
  secretsmgr: "secretsmanager",
  cloudwatchlogs: "cloudwatch",
};

export function canonicalService(key: string): string {
  const k = key.toLowerCase().replace(/[^a-z0-9-]/g, "");
  return ALIASES[k] ?? k;
}

export function catalog(): Snapshot["catalog"] {
  return {
    services: SERVICE_NAMES,
    regions: REGION_NAMES,
    coreServices: CORE_SERVICES,
    coreRegions: CORE_REGIONS,
  };
}
