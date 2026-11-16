# HUB MIND — Meta App Review readiness

Status: **NOT YET VERIFIED / do not submit until checks pass**.
Scope: Instagram Messaging integration used by authorized HUB MIND staff to receive and respond to customer inquiries in the CRM.

## Existing repo evidence
- Public privacy page: `/privacy` (`privacy.html`).
- Public deletion instructions: `/data-deletion` (`data-deletion.html`).
- Instagram webhook source: `supabase/functions/instagram-webhook/index.ts` is labeled **V2**. Prior deployment work referenced **V4.1**. Do **not** deploy V2 over the live function without reconciling deployed source.
- The checked-in V2 webhook requires `INSTAGRAM_WEBHOOK_INGEST_ENABLED=true`, an exact organization/account mapping, a valid `x-hub-signature-256`, and Meta verification token. These are not evidence that production ingestion is enabled.

## Blocking verification before submission
- [ ] Confirm exact Meta app ID, app type, business verification status, and requested permissions in Meta App Dashboard.
- [ ] Confirm the Meta app's public Privacy Policy URL and User Data Deletion Instructions URL both load over HTTPS without login, on desktop and mobile.
- [ ] Verify public URLs actually route to these HTML pages (not only that files exist in GitHub).
- [ ] Verify current deployed Supabase Instagram webhook version, environment flags, secrets, and mapped Instagram account; compare with repo before any deployment.
- [ ] Complete real inbound Instagram DM test: sender account → Meta webhook → database conversation/message → CRM inbox, without using fabricated events.
- [ ] Complete outbound reply test from CRM → same Instagram thread; record success/error and ensure Meta messaging window and permissions are respected.
- [ ] Verify that webhook retries do not create duplicate messages and that invalid signatures are rejected.
- [ ] Verify access controls: only authorized organization staff can view/reply to their organization's conversations; no cross-tenant exposure.
- [ ] Confirm actual implementation supports **every** requested Meta permission; remove unnecessary permission requests.
- [ ] Prepare reviewer-accessible test credentials or a documented alternative consistent with Meta's current review instructions. Do not place credentials in repository.
- [ ] Record an end-to-end screencast showing login, account connection (if applicable), incoming DM, CRM conversation, and reply; include clear narration/captions.
- [ ] Draft accurate per-permission justifications tied to visible functionality; provide steps to reproduce and test assets in Meta App Review.
- [ ] Test privacy/deletion contact process operationally and ensure responses can be handled; never promise an automated deletion endpoint that does not exist.
- [ ] Verify app icon, app domain, contact email, and other dashboard fields are correct.

## Reviewer walkthrough (fill in only after verified)
1. Open the HUB MIND web application at its actual public HTTPS URL.
2. Sign in with the dedicated reviewer account provided securely in Meta App Review.
3. Navigate to CRM → Instagram inbox (verify actual menu names).
4. Send a DM from the permitted Instagram test account to the connected HUB MIND Instagram account.
5. Show the inbound message in the inbox and send a reply.
6. Explain that messages are used for customer support and lead follow-up, not for unrelated data collection.

## Submission rule
Do not mark ready based on repository files alone. Production behavior, requested permissions, Meta Dashboard configuration, and the review video require direct verification. Never publish tokens, app secrets, service-role keys, or reviewer passwords in commits.
