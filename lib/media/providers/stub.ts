// lib/media/providers/stub.ts
//
// Deterministic offline media provider. Completes synchronously with a placeholder
// output so the reserve→settle path can be exercised end to end without RunPod.

import type { MediaProvider } from './types';

export const stubProvider: MediaProvider = {
  name: 'stub',
  async submit(input) {
    return {
      providerJobId: `stub-${input.jobId}`,
      status: 'succeeded',
      outputKey: `media/${input.jobId}/output.bin`,
      actualCostMusd: 1000, // 0.001 USD placeholder
      gpuSeconds: 3,
    };
  },
};
