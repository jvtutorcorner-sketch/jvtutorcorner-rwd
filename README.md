This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

**GraphQL / Amplify notes**

- If you use AWS Amplify / AppSync with this repository and the included `schema.graphql`, after updating the schema run:

```bash
# push schema changes and backend
amplify push

# generate client models (DataStore) or GraphQL statements
amplify codegen models
amplify codegen
```

- If you prefer GraphQL Code Generator (recommended for typed clients), add a `codegen.yml` and run:

```bash
npm install -D @graphql-codegen/cli @graphql-codegen/typescript @graphql-codegen/typescript-operations
npx graphql-codegen --config codegen.yml
```

**Example GraphQL mutations / queries**

- Create Enrollment (報名，會預設 status = PENDING_PAYMENT):

```graphql
mutation CreateEnrollment($input: CreateEnrollmentInput!) {
	createEnrollment(input: $input) {
		id
		studentID
		courseID
		status
		createdAt
	}
}

# variables
{
	"input": {
		"studentID": "student-123",
		"courseID": "course-123",
		"status": "PENDING_PAYMENT"
	}
}
```

- Create Order (關聯 enrollment):

```graphql
mutation CreateOrder($input: CreateOrderInput!) {
	createOrder(input: $input) {
		id
		amount
		currency
		status
		enrollmentID
		createdAt
	}
}

# variables
{
	"input": {
		"amount": 1000,
		"currency": "TWD",
		"status": "PENDING",
		"enrollmentID": "<ENROLLMENT_ID>"
	}
}
```

- Update Order status (例如金流 webhook 將訂單設為 PAID)：

```graphql
mutation UpdateOrder($input: UpdateOrderInput!) {
	updateOrder(input: $input) {
		id
		status
		updatedAt
	}
}

# variables
{
	"input": {
		"id": "<ORDER_ID>",
		"status": "PAID"
	}
}
```

- Query enrollments by student:

```graphql
query ListEnrollmentsByStudent($studentID: ID!) {
	listEnrollments(filter: { studentID: { eq: $studentID } }) {
		items {
			id
			courseID
			status
			orderId
		}
	}
}
```

---

If you'd like, I can also:
- Add example `codegen.yml` for `@graphql-codegen/cli`.
- Adjust `@auth` rules to include finer-grained permissions (e.g. teachers can `read` and `update` but not `delete`).
