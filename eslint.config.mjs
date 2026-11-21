import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

const adapterClairicRestriction = {
  name: "@quimera/adapter-clairic",
  message:
    "Prohibido importar @quimera/adapter-clairic (ADR-012). Inyectar StructuredExtractorPort solo si el usuario lo instala.",
};

const appsImportPatterns = [
  {
    group: ["apps/**", "**/apps/**"],
    message: "packages/* no puede importar apps/* (ADR-001 / regla de frontera monorepo).",
  },
];

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/coverage/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["packages/**/*.{ts,mts,cts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [adapterClairicRestriction],
          patterns: [
            ...appsImportPatterns,
            {
              group: ["**/adapter-clairic/**"],
              message: adapterClairicRestriction.message,
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/oficios/**/*.{ts,mts,cts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [adapterClairicRestriction],
          patterns: [
            {
              group: ["**/adapter-clairic/**"],
              message: adapterClairicRestriction.message,
            },
          ],
        },
      ],
    },
  },
);