import type { ApprovedReplaySource } from "../../../src/reconstructionKernel/index.js";

const approvalReference = "product-approved-rescue-corpus-sources-v1";

export const rescueSourceManifest = {
  "basys-march-2020": {
    schemaVersion: "rescue-source-manifest-v1",
    approvalReference,
    caseId: "basys-march-2020",
    mediaType: "application/pdf",
    contentSha256: "25818af711fdcd1fec7b764fa95fa255306fda52ee223b31091311cafb1cc4d8",
    byteLength: 117_072,
    expectedPageCount: 8,
    expectedSourceRowCount: 432,
    expectedSourceRowFingerprint: "9539fb808a83dfdcbd5b3519111435bd867369f25bf8209c72d9ea197c8c7ad5",
  },
  "paysafe-october-2025": {
    schemaVersion: "rescue-source-manifest-v1",
    approvalReference,
    caseId: "paysafe-october-2025",
    mediaType: "application/pdf",
    contentSha256: "a863eb9116197a5866d789e9f4ed95dae71d9b2c21ebe4dcfa029314cc842789",
    byteLength: 135_072,
    expectedPageCount: 4,
    expectedSourceRowCount: 173,
    expectedSourceRowFingerprint: "d0ccabb685d843cdd63e8db382e31ad2df93942bc8f0349ef341a31ab8c5909f",
  },
  "wells-fargo-september-2024": {
    schemaVersion: "rescue-source-manifest-v1",
    approvalReference,
    caseId: "wells-fargo-september-2024",
    mediaType: "application/pdf",
    contentSha256: "2aa3902cff949b6a746d140d690f566088b0eb8f5310b1f363207063932b24c7",
    byteLength: 177_848,
    expectedPageCount: 8,
    expectedSourceRowCount: 396,
    expectedSourceRowFingerprint: "1c943836fd5c81b085a4544a0133bfdb8bfaff0cd1b42a364582e10383ccf5a9",
  },
  "clover-duplicate-resubmission": {
    schemaVersion: "rescue-source-manifest-v1",
    approvalReference,
    caseId: "clover-duplicate-resubmission",
    mediaType: "application/pdf",
    contentSha256: "84108f34275e039ce53ebfa3daa8dbf32eab3b68f2a55e00b4e12bd106bc86bf",
    byteLength: 139_746,
    expectedPageCount: 2,
    expectedSourceRowCount: 84,
    expectedSourceRowFingerprint: "064b92fdc8f6ea769087aeaeb1f18d660a9a5f0c498e9cd46fa80dd8a6abdcae",
  },
  "vortax-september-2022": {
    schemaVersion: "rescue-source-manifest-v1",
    approvalReference,
    caseId: "vortax-september-2022",
    mediaType: "application/pdf",
    contentSha256: "1f0e1a8c822f9dd086ec00caaec9ab5f7a2fbb1e322928fbac1a704f1d14d230",
    byteLength: 55_386,
    expectedPageCount: 10,
    expectedSourceRowCount: 354,
    expectedSourceRowFingerprint: "de924b6a6f4cfb689109d9c63bb99ad6f9658408630d49f31607c97293563762",
  },
} as const satisfies Record<string, ApprovedReplaySource>;

export const rescueSourceFiles = {
  "basys-march-2020": "test/fixtures/pdfs/fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf",
  "paysafe-october-2025": "test/fixtures/pdfs/fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf",
  "wells-fargo-september-2024": "test/fixtures/pdfs/fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf",
  "clover-duplicate-resubmission": "test/fixtures/pdfs/SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf",
  "vortax-september-2022": "test/fixtures/pdfs/fiserv_NXGEN_VORTAX_Sep_2022.pdf",
} as const satisfies Record<keyof typeof rescueSourceManifest, string>;
