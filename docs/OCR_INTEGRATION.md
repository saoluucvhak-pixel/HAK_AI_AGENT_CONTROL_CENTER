# OCR integration plan — HAK AI Agent Control Center

## Source
Use https://github.com/saoluucvhak-pixel/HAK_OCR_ENGINE as the sole OCR runtime source. Existing Python offline OCR, JS Electron OCR and optional advanced engines stay in that repository. No runtime OCR adapter is shipped by this MVP.

## Proposed modules
1. Intake: local file upload/import, MIME validation, SHA-256, immutable original, document type.
2. Extraction worker: versioned adapter to OCR engine via local queue/IPC, sandboxed process, model availability checks, page/cell evidence.
3. Document validation: schema for weigh tickets, timesheets, invoices, contracts and payment documents; reconcile fields and totals.
4. Review Studio: original page beside extracted fields/tables, highlight source region, correct cells, approve/reject.
5. Business adapters: only APPROVED payloads may be imported into HAK payroll, warehouse, DNTT and accounting, with idempotency key and transaction log.
6. Observer: task state, duration, warnings, engine version and error logs; never log raw sensitive text.
7. Learning: store approved corrections locally and suggest rules; never auto-approve or silently overwrite.

## Proposed contract (not yet implemented)
Input: task_id, document_type, local_file_ref, schema_version, actor, requested_fields.
Output: task_id, source_sha256, engine, model_version, fields with confidence/provenance, table cells, warnings, review_status.
States: QUEUED → RUNNING → NEEDS_REVIEW → APPROVED or REJECTED; FAILED on errors.
Confidence is only a hint, not approval. Missing confidence is UNKNOWN, not 100%.

## Security
Offline by default; local encrypted storage where available; role-based review; bounded file size/pages, malicious file checks, no untrusted shell args; secrets and PII must not appear in logs. Never send documents to external AI services without explicit permission.

## Verification gates
- Contract and parser tests using synthetic fixtures.
- Regression against skewed, curved, low-light tables, handwritten fields, PDF text and scan.
- Reconciliation checks for kilograms/tons, invoice numbers, totals and payroll days.
- Human-review authorization, duplicate imports, crash/restart, and Windows offline acceptance.
- No merge or production claim until real adapter tests and UI review pass.

## Relationship to MVP
Current `src/server.js` is a localhost-only in-memory task event API, not a file ingestion or OCR service. OCR support here is an **architecture proposal** pending implementation.
