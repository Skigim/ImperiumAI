export interface CpuPolicy {
  baseline: number;
  burstBucketThreshold: number;
}

export const defaultCpuPolicy: CpuPolicy = {
  baseline: 20,
  burstBucketThreshold: 7500,
};
