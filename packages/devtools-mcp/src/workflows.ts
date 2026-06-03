import type { WorkflowGuide } from "./types.js"

export const WORKFLOWS: ReadonlyArray<WorkflowGuide> = [
  {
    commonPitfalls: [
      "Do not mix mainnet addresses with preview/preprod chain presets.",
      "Do not hardcode secrets in examples; use environment variables for provider keys and mnemonics.",
      "Prefer namespace imports from the package entrypoint while exploring, then deep imports for focused production code."
    ],
    id: "getting-started",
    intent: "Install and start using the core Evolution SDK package in a TypeScript app.",
    packages: ["@evolution-sdk/evolution"],
    relatedPaths: [
      "README.md",
      "docs/content/docs/introduction/getting-started.mdx",
      "docs/content/docs/introduction/imports.mdx",
      "packages/evolution/src/index.ts"
    ],
    steps: [
      "Install @evolution-sdk/evolution.",
      "Import the chain preset and modules needed for the task.",
      "Create a Client with a chain preset, provider, and wallet.",
      "Use module helpers for typed Cardano values instead of ad hoc strings."
    ],
    title: "Getting Started",
    verification: ["pnpm --filter @evolution-sdk/evolution type-check"]
  },
  {
    commonPitfalls: [
      "A provider-only client can query but cannot sign transactions.",
      "Blockfrost, Koios, Kupmios, and Maestro configuration shapes differ; inspect provider docs before generating code.",
      "Wallet and provider must target the same chain."
    ],
    id: "client-provider-wallet",
    intent: "Assemble a chain-aware client with provider and wallet capabilities.",
    packages: ["@evolution-sdk/evolution"],
    relatedPaths: [
      "packages/evolution/src/sdk/client/Client.ts",
      "packages/evolution/src/sdk/client/Chain.ts",
      "docs/content/docs/clients/client-basics.mdx",
      "docs/content/docs/clients/providers.mdx",
      "docs/content/docs/providers/provider-types.mdx"
    ],
    steps: [
      "Pick mainnet, preprod, preview, or a devnet chain from Cluster.getChain.",
      "Call Client.make(chain).",
      "Attach a provider with withBlockfrost, withKoios, withKupmios, or withMaestro.",
      "Attach wallet capabilities with withSeed, withPrivateKey, withCip30, or withAddress depending on the workflow."
    ],
    title: "Client, Provider, And Wallet Setup",
    verification: ["pnpm --filter @evolution-sdk/evolution test -- Client"]
  },
  {
    commonPitfalls: [
      "Use bigint for lovelace amounts.",
      "Build returns a transaction result; signing and submission are separate unless using signAndSubmit.",
      "A read-only client can build unsigned results but cannot sign."
    ],
    id: "transaction-payment",
    intent: "Build, sign, and submit a simple ADA or multi-asset payment.",
    packages: ["@evolution-sdk/evolution"],
    relatedPaths: [
      "docs/content/docs/common-patterns.mdx",
      "docs/content/docs/architecture/transaction-flow.mdx",
      "packages/evolution/src/sdk/builders/TransactionBuilder.ts",
      "packages/evolution/test/Transaction.CML.test.ts"
    ],
    steps: [
      "Create a client with chain, provider, and signing wallet.",
      "Call client.newTx().payToAddress({ address, assets }).",
      "Call build(), then sign(), then submit().",
      "Use Assets.fromLovelace for ADA-only outputs and Value/MultiAsset helpers for multi-asset outputs."
    ],
    title: "Build A Payment Transaction",
    verification: ["pnpm --filter @evolution-sdk/evolution test -- Transaction"]
  },
  {
    commonPitfalls: [
      "Plutus integers are bigint, not number.",
      "Use Data.withSchema(TSchema...) when application types should round-trip to on-chain data.",
      "Keep byte arrays as Uint8Array or hex through the SDK helpers rather than raw UTF-8 strings."
    ],
    id: "plutus-data-tschema",
    intent: "Represent typed Plutus data, datums, redeemers, and CBOR values.",
    packages: ["@evolution-sdk/evolution"],
    relatedPaths: [
      "packages/evolution/src/Data.ts",
      "packages/evolution/src/TSchema.ts",
      "docs/content/docs/encoding/data.mdx",
      "docs/content/docs/encoding/tschema.mdx",
      "packages/evolution/test/Data.test.ts",
      "packages/evolution/test/TSchema.test.ts"
    ],
    steps: [
      "Model on-chain data with Data.constr, Data.map, arrays, bigint, and bytes.",
      "Use TSchema.Struct, TSchema.Integer, and TSchema.ByteArray for typed application data.",
      "Create a codec with Data.withSchema(schema).",
      "Encode to CBOR hex only at the boundary where scripts or transaction fields need it."
    ],
    title: "Plutus Data And TSchema",
    verification: [
      "pnpm --filter @evolution-sdk/evolution test -- Data",
      "pnpm --filter @evolution-sdk/evolution test -- TSchema"
    ]
  },
  {
    commonPitfalls: [
      "Aiken works in Node and browser through conditional WASM exports.",
      "Scalus is Node-focused; the browser entry currently throws.",
      "Local evaluators are used during transaction build when script redeemers need ex-units."
    ],
    id: "local-script-evaluation",
    intent: "Evaluate Plutus scripts locally with Aiken or Scalus while building transactions.",
    packages: ["@evolution-sdk/evolution", "@evolution-sdk/aiken-uplc", "@evolution-sdk/scalus-uplc"],
    relatedPaths: [
      "packages/aiken-uplc/src/index.node.ts",
      "packages/aiken-uplc/src/index.browser.ts",
      "packages/scalus-uplc/src/index.node.ts",
      "packages/scalus-uplc/src/index.browser.ts",
      "docs/content/docs/architecture/script-evaluation.mdx",
      "packages/evolution-devnet/test/TxBuilder.Scripts.test.ts"
    ],
    steps: [
      "Import createAikenEvaluator or createScalusEvaluator.",
      "Build the script transaction with collectFrom, attachScript, readFrom, mintAssets, or related builder methods.",
      "Pass the evaluator to the transaction build path where required by the builder API.",
      "Compare failures against docs and tests for redeemer indexing, collateral, and protocol context."
    ],
    title: "Local Script Evaluation",
    verification: ["pnpm --filter @evolution-sdk/aiken-uplc build", "pnpm --filter @evolution-sdk/scalus-uplc build"]
  },
  {
    commonPitfalls: [
      "Docker must be installed and running.",
      "Always stop/remove clusters in test teardown.",
      "Use Cluster.getChain(cluster) so client network settings match the local chain."
    ],
    id: "devnet-kupmios-test",
    intent: "Create a Docker-backed local Cardano network for tests and app development.",
    packages: ["@evolution-sdk/devnet", "@evolution-sdk/evolution"],
    relatedPaths: [
      "packages/evolution-devnet/README.md",
      "packages/evolution-devnet/src/Cluster.ts",
      "packages/evolution-devnet/src/Config.ts",
      "docs/content/docs/devnet/getting-started.mdx",
      "packages/evolution-devnet/test/Devnet.integration.test.ts"
    ],
    steps: [
      "Create a cluster with Cluster.make(config).",
      "Enable Kupo and Ogmios when the app needs Kupmios provider queries.",
      "Start the cluster and derive chain config with Cluster.getChain(cluster).",
      "Use Genesis.calculateUtxosFromConfig for deterministic pre-funded test fixtures.",
      "Stop and remove containers after tests."
    ],
    title: "Devnet And Kupmios Tests",
    verification: ["pnpm --filter @evolution-sdk/devnet test"]
  },
  {
    commonPitfalls: [
      "Browser apps need a CIP-30 wallet and a provider; the wallet alone is not a chain provider.",
      "Keep env var names aligned with the example README.",
      "Do not submit mainnet transactions from example code unless explicitly intended."
    ],
    id: "vite-cip30-payment",
    intent: "Build a browser app that connects a CIP-30 wallet and submits a payment.",
    packages: ["@evolution-sdk/evolution"],
    relatedPaths: [
      "examples/with-vite-react/README.md",
      "examples/with-vite-react/src/App.tsx",
      "examples/with-vite-react/src/components/WalletConnect.tsx",
      "examples/with-vite-react/src/components/TransactionBuilder.tsx"
    ],
    steps: [
      "Use the Vite React example as the shape for environment variables and wallet connection.",
      "Connect a CIP-30 wallet.",
      "Create a Client with provider and withCip30 wallet capabilities.",
      "Build, sign, and submit through the app UI."
    ],
    title: "Vite React CIP-30 Payment App",
    verification: ["pnpm --filter with-vite-react type-check", "pnpm --filter with-vite-react build"]
  },
  {
    commonPitfalls: [
      "Blueprint codegen is for CIP-57 Plutus blueprints, not arbitrary JSON.",
      "Inspect validator names and parameter schemas before generating application code.",
      "Generated types should be checked into the app using stable naming config."
    ],
    id: "blueprint-codegen",
    intent: "Generate typed TypeScript helpers from Plutus blueprints.",
    packages: ["@evolution-sdk/evolution"],
    relatedPaths: [
      "packages/evolution/src/blueprint/Codegen.ts",
      "packages/evolution/src/blueprint/CodegenConfig.ts",
      "packages/evolution/src/blueprint/Types.ts",
      "docs/content/docs/smart-contracts/blueprint-codegen.mdx",
      "docs/public/sample-blueprint.json"
    ],
    steps: [
      "Load and validate the Plutus blueprint JSON.",
      "Inspect validators and their parameter schemas.",
      "Choose codegen naming/module strategy.",
      "Generate TypeScript and type-check it in the consuming app."
    ],
    title: "Blueprint Codegen",
    verification: ["pnpm --filter @evolution-sdk/evolution test -- Blueprint"]
  },
  {
    commonPitfalls: [
      "CBOR format preservation is intentional in parts of the SDK; do not normalize encoded bytes accidentally.",
      "Pick the specific module decoder for the artifact type being inspected.",
      "UPLC script hex may be double-CBOR encoded depending on the source."
    ],
    id: "cbor-and-uplc-inspection",
    intent: "Decode and inspect transactions, witness sets, Plutus data, UPLC, and related CBOR artifacts.",
    packages: ["@evolution-sdk/evolution"],
    relatedPaths: [
      "packages/evolution/src/CBOR.ts",
      "packages/evolution/src/UPLC.ts",
      "docs/content/docs/encoding/cbor.mdx",
      "docs/content/docs/encoding/uplc.mdx",
      "packages/evolution/test/CBOR.test.ts",
      "packages/evolution/test/Transaction-with-format.test.ts"
    ],
    steps: [
      "Identify the artifact type before choosing a decoder.",
      "Use module-specific fromCBORHex/fromCBORBytes helpers where available.",
      "Preserve original format bytes when tests or transaction validity require exact encoding.",
      "Use UPLC helpers for parameter application and script inspection workflows."
    ],
    title: "CBOR And UPLC Inspection",
    verification: [
      "pnpm --filter @evolution-sdk/evolution test -- CBOR",
      "pnpm --filter @evolution-sdk/evolution test -- UPLC"
    ]
  },
  {
    commonPitfalls: [
      "Governance and staking builder methods often need credentials, anchors, or protocol-era fields with exact SDK types.",
      "Use tests as executable examples because many operations are covered there before docs.",
      "Validate fee and witness behavior after adding certificates or votes."
    ],
    id: "staking-governance",
    intent: "Build staking, delegation, DRep, voting, proposal, pool, and committee transactions.",
    packages: ["@evolution-sdk/evolution", "@evolution-sdk/devnet"],
    relatedPaths: [
      "docs/content/docs/staking/delegation.mdx",
      "docs/content/docs/governance/voting.mdx",
      "packages/evolution-devnet/test/TxBuilder.Stake.test.ts",
      "packages/evolution-devnet/test/TxBuilder.Governance.test.ts",
      "packages/evolution-devnet/test/TxBuilder.Vote.test.ts"
    ],
    steps: [
      "Resolve the exact credential/action type from the corresponding module docs.",
      "Use client.newTx() builder methods for staking or governance operations.",
      "Prefer devnet tests as patterns for realistic chain state.",
      "Build, sign, and validate behavior with targeted transaction builder tests."
    ],
    title: "Staking And Governance",
    verification: [
      "pnpm --filter @evolution-sdk/devnet test -- TxBuilder.Stake",
      "pnpm --filter @evolution-sdk/devnet test -- TxBuilder.Governance"
    ]
  },
  {
    commonPitfalls: [
      "Do not edit generated docs or dist output as source of truth.",
      "Keep package exports and publishConfig exports aligned.",
      "Run targeted package verification before root verification to isolate failures."
    ],
    id: "repository-contribution",
    intent: "Make and verify changes inside the Evolution SDK monorepo.",
    packages: ["evolution-sdk"],
    relatedPaths: [
      "package.json",
      "pnpm-workspace.yaml",
      "turbo.json",
      "eslint.config.mjs",
      "vitest.config.ts",
      "CONTRIBUTING.md"
    ],
    steps: [
      "Identify the owning package and nearest tests.",
      "Use package-level scripts through pnpm --filter first.",
      "Run type-check, lint, and tests for touched packages.",
      "Run root verify when the change crosses package boundaries."
    ],
    title: "Repository Contribution Workflow",
    verification: ["pnpm type-check", "pnpm lint", "pnpm test"]
  }
]
