Project Ascend integrated: replaced ONLY Apply & Consent UI with separate simulated lender onboarding. Preserved Decision Lab, Assessment, Credit Ladder and their underlying source files. Shared demoStore extended with draft, consent choices, lender state. No real authentication, KYC, banking or backend.

Run: npm ci; npm run build; npm test; npm run dev
Open /apply, switch For lenders, complete synthetic registration, preview assessment; also test applicant consent and all three remaining routes.
