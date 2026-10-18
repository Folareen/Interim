// docs/product/spec.md section 10. Costs marked null are unconfirmed (verify in the spike).
export const unitCosts: Record<string, number | null> = {
  hair_type: 2,
  beard_style: 2,
  hair_color: 1,
  makeup_tryon: 1,
  skin_tone: 20,
  hairstyle: 2,
  hair_density: null,
  hair_length: null,
  hair_volume: null,
  clothes_v4: null,
};

// Documented limit: 250 requests per 300 seconds.
export const rateLimit = { requests: 250, windowSeconds: 300 } as const;
