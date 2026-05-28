export const SiteProfileSchema = {
  type: "json_schema",
  json_schema: {
    name: "SiteProfile",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["domain", "businessType", "primaryOffering", "industry", "confidence"],
      properties: {
        domain: { type: "string", minLength: 2, maxLength: 140 },

        businessType: {
          type: "string",
          enum: ["product", "service", "marketplace", "publisher", "community", "saas", "unknown"],
        },

        primaryOffering: { type: "string", minLength: 2, maxLength: 220 },
        industry: { type: "string", minLength: 2, maxLength: 120 },

        // Short phrases, used to anchor keyword universe + competitor universe
        offerings: {
          type: "array",
          minItems: 3,
          maxItems: 12,
          items: { type: "string", minLength: 2, maxLength: 80 },
        },

        geoFocus: { type: "string", minLength: 0, maxLength: 80 },

        confidence: { type: "number", minimum: 0, maximum: 1 },

        // Ask model to list the public sources it relied on (URLs or source titles)
        publicSignalsUsed: {
          type: "array",
          maxItems: 12,
          items: { type: "string", minLength: 0, maxLength: 220 },
        },

        assumptions: {
          type: "array",
          maxItems: 12,
          items: { type: "string", minLength: 0, maxLength: 220 },
        },
      },
    },
  },
};

export const KeywordsSchema = {
  type: "json_schema",
  json_schema: {
    name: "KeywordSuggestionResponse",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["domain", "keywords"],
      properties: {
        domain: { type: "string" },
        keywords: {
          type: "array",
          minItems: 12,
          maxItems: 30,
          items: { type: "string", minLength: 2, maxLength: 80 },
        },
        clusters: {
          type: "array",
          maxItems: 12,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "keywords"],
            properties: {
              name: { type: "string", minLength: 2, maxLength: 50 },
              keywords: {
                type: "array",
                minItems: 3,
                maxItems: 10,
                items: { type: "string", minLength: 2, maxLength: 80 },
              },
            },
          },
        },
        assumptions: {
          type: "array",
          maxItems: 12,
          items: { type: "string", minLength: 0, maxLength: 220 },
        },
      },
    },
  },
};

export const CompetitorsSchema = {
  type: "json_schema",
  json_schema: {
    name: "CompetitorSuggestionResponse",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["domain", "businessCompetitors", "searchCompetitors"],
      properties: {
        domain: { type: "string" },

        businessCompetitors: {
          type: "array",
          minItems: 4,
          maxItems: 12,
          items: { type: "string", minLength: 2, maxLength: 140 },
        },

        searchCompetitors: {
          type: "array",
          minItems: 6,
          maxItems: 20,
          items: { type: "string", minLength: 2, maxLength: 140 },
        },

        buckets: {
          type: "object",
          additionalProperties: false,
          properties: {
            directSellers: { type: "array", items: { type: "string" } },
            marketplaces: { type: "array", items: { type: "string" } },
            couponSites: { type: "array", items: { type: "string" } },
            affiliateBlogs: { type: "array", items: { type: "string" } },
            directories: { type: "array", items: { type: "string" } },
            publishers: { type: "array", items: { type: "string" } },
            reviewPlatforms: { type: "array", items: { type: "string" } },
            other: { type: "array", items: { type: "string" } },
          },
        },

        assumptions: {
          type: "array",
          maxItems: 12,
          items: { type: "string", minLength: 0, maxLength: 220 },
        },
      },
    },
  },
};
