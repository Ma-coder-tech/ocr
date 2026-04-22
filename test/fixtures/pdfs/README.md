# PDF Test Fixtures

Expected filenames:

- `SAMPLE_MERCHANT4_CLOVER.pdf`: Clover October sample statement used by the Clover pass fixture and structured-extraction test.
- `Nov_2024_Statement.pdf`: Clover November sample statement used by the second Clover pass fixture.
- `SAMPLE_MERCHANT_2Statement_Bloom-To-Beauty-By-Maria-Jan-24.pdf`: Bloom January sample statement used by the warning fixture and structured-extraction test.
- `SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf`: Clover June processing report used by the unknown-case fixture.
- `110012-Arre_t_n_05-CJ-CM_Dos_2022-20_QUENUM_C_MEGNIGBETO.pdf`: scanned/image-only PDF used by the structured-extraction guard test.

Copy the corresponding sample merchant PDF into this directory using the exact filename listed above, then run `npm test`.
